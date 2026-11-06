import { randomUUID } from "crypto";
import {
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import { docClient } from "../config/dynamodb.js";

const TABLE_NAME = process.env.DYNAMODB_USERS_TABLE || "UnQueUsers";

const createUser = async (userData) => {
  const user = {
    userId: randomUUID(),
    name: userData.name,
    email: userData.email,
    password: userData.password,
    role: userData.role,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: user,
      ConditionExpression: "attribute_not_exists(email)",
    })
  );

  return user;
};

const getUserByEmail = async (email) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { email },
    })
  );

  return result.Item || null;
};

const getUserById = async (userId) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "UserIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      Limit: 1,
    })
  );

  return result.Items?.[0] || null;
};

export { createUser, getUserByEmail, getUserById };