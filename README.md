# UnQue 2.0 - College Appointment System (AWS deployment)

Node.js/Express backend that lets students book appointments with professors.
Professors publish free time slots, update or cancel them, and students
authenticate, view slots and book. The backend runs on **AWS EC2** and stores
data in **Amazon DynamoDB**.

## Architecture

```
Postman / client
      |  HTTP :5001
      v
EC2 (Ubuntu, Node 22, systemd service "unque")
      |-- IAM instance role --> DynamoDB (UnQueUsers, UnQueAvailability, UnQueAppointments)
      '-- IAM instance role --> SSM Parameter Store (/unque/production/JWT_SECRET)
```

## Database choice

The assignment mentions DocumentDB. **DynamoDB is used instead, to keep AWS costs
low.** Approved by: `<NAME / ROLE>` on `<DATE>` (`<EMAIL OR MESSAGE REFERENCE>`).

| Table | Keys |
|---|---|
| `UnQueUsers` | partition key `email` (String) |
| `UnQueAvailability` | partition key `professorId`, sort key `availabilityId` |
| `UnQueAppointments` | `PK` / `SK` (booking records plus per-time lock items) and a `StudentAppointmentIndex` index |

## API reference

All routes except register and login need `Authorization: Bearer <token>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/users/register` | public | Register (`name`, `email`, `password`, `confirmPassword`, `role`: `student` or `professor`) |
| POST | `/users/login` | public | Log in (`email`, `password`) and receive a JWT |
| GET | `/users/profile/:id` | any user | Own profile only |
| POST | `/professor/availability` | professor | Add a free slot (`startTime`, `endTime`, ISO 8601) |
| **PATCH** | **`/professor/availability/:availabilityId`** | professor | **NEW: change the timing of an existing free slot** |
| PATCH | `/professor/cancel-appointments/:studentId` | professor | Cancel a student's booked appointments with this professor |
| GET | `/general/availability/:professorId` | any user | List a professor's slots |
| POST | `/general/book-appointment` | student | Book (`professorId`, `time`) |
| GET | `/general/my-appointments` | student | List own pending appointments |

### New API: update a free slot

`PATCH /professor/availability/:availabilityId`

```json
{ "startTime": "2026-12-01T14:00:00.000Z", "endTime": "2026-12-01T14:30:00.000Z" }
```

- The slot is **updated in place** with a DynamoDB `UpdateItem`. It is never
  deleted, so `availabilityId` and `createdAt` stay the same and an `updatedAt`
  field is added.
- `404` if the slot does not belong to the calling professor.
- `400` for invalid times, if the slot already contains a booked appointment,
  or if the new time overlaps another slot of the same professor.
- `200` with the updated `availability` object on success.

## Configuration

Copy `.env.example` to `.env`. **Never commit `.env`.**
On EC2 the user-data script writes `.env` itself and reads the JWT secret from
SSM Parameter Store.

## Run locally

```bash
npm ci
cp .env.example .env     # then edit the values
npm start                # or: npm run dev
```

Local runs need AWS credentials with access to the three tables
(for example via `AWS_PROFILE`).

## Deploy on EC2

1. Create a SecureString parameter `/unque/production/JWT_SECRET` in `ap-southeast-2`.
2. Create an IAM role for EC2 with `AmazonSSMManagedInstanceCore` plus this policy
   (replace `<ACCOUNT_ID>`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ssm:GetParameter",
         "Resource": "arn:aws:ssm:ap-southeast-2:<ACCOUNT_ID>:parameter/unque/production/JWT_SECRET"
       },
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
           "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
           "dynamodb:ConditionCheckItem"
         ],
         "Resource": [
           "arn:aws:dynamodb:ap-southeast-2:<ACCOUNT_ID>:table/UnQue*",
           "arn:aws:dynamodb:ap-southeast-2:<ACCOUNT_ID>:table/UnQue*/index/*"
         ]
       }
     ]
   }
   ```
3. Launch an **Ubuntu 22.04/24.04** instance in a public subnet with a public IP,
   the role attached, and a security group allowing **22** (your IP) and **5001**.
4. Paste `deploy/unque-user-data.sh` into **Advanced details -> User data**.
   The repository must be public because the script clones it over HTTPS.
5. After 3-5 minutes, check **Actions -> Monitor and troubleshoot -> Get system log**
   for `API is responding on port 5001`, then open `http://<EC2_PUBLIC_IP>:5001`
   (a JSON "Not Found" means the API is up).

The service runs as `unque.service`. On the instance (Session Manager):
`sudo systemctl status unque` and `sudo journalctl -u unque -n 50 --no-pager`.

## Testing with Postman

Import `postman/UnQue-EC2-Demo.postman_collection.json`, set the `baseUrl`
collection variable to `http://<EC2_PUBLIC_IP>:5001`, run the **Setup** folder
once, then the **Demo flow** requests in order. Tokens and IDs are stored
automatically.

| Step | Action | Expected |
|---|---|---|
| 1-2 | Student A1 and Professor P1 log in | 200 |
| 3 | P1 adds free slots T1, T2, T3 | 201 |
| 4 | A1 views P1's slots | 200 |
| 5 | A1 books T1 | 201 |
| 6-7 | A2 logs in and books T2 | 200 / 201 |
| 8 | P1 updates free slot T3 (new API) | 200 |
| 8b | P1 tries to update booked slot T2 | 400 (protected) |
| 9 | P1 cancels A1's appointment | 200 |
| 10 | A1 checks appointments | 404 "no pending appointments" |

## Demo video

https://drive.google.com/file/d/1Ur7TZ8-35rD2lr5igxB7wkrQG2zYYK0K/view?usp=drive_link

## Security notes

- Secrets stay out of git: `.env` is ignored and the JWT secret lives in SSM.
- The API currently serves plain HTTP on port 5001. For production, put nginx or
  an Application Load Balancer with HTTPS in front and close port 5001.
