import { randomUUID } from "crypto";

import {
  TransactWriteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import { docClient } from "../config/dynamodb.js";

const TABLE_NAME =
  process.env.DYNAMODB_APPOINTMENTS_TABLE || "UnQueAppointments";

// Create a new appointment and reserve the professor's time
const createAppointment = async ({
  studentId,
  professorId,
  time,
}) => {
  const appointmentId = randomUUID();
  const appointmentTime = new Date(time).toISOString();
  const now = new Date().toISOString();

  const appointment = {
    PK: `PROFESSOR#${professorId}`,
    SK: `APPOINTMENT#${appointmentTime}#${appointmentId}`,

    GSI1PK: `STUDENT#${studentId}`,
    GSI1SK: `TIME#${appointmentTime}#${appointmentId}`,

    appointmentId,
    studentId,
    professorId,
    time: appointmentTime,
    status: "booked",
    createdAt: now,
    updatedAt: now,
  };

  const bookingLock = {
    PK: `PROFESSOR#${professorId}`,
    SK: `LOCK#${appointmentTime}`,
    entityType: "BOOKING_LOCK",
    appointmentId,
  };

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: bookingLock,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: appointment,
          },
        },
      ],
    })
  );

  return appointment;
};

// Get all appointments belonging to a professor
const getAppointmentsByProfessor = async (professorId) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression:
        "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `PROFESSOR#${professorId}`,
        ":prefix": "APPOINTMENT#",
      },
    })
  );

  return result.Items || [];
};

// Get all appointments belonging to a student
const getAppointmentsByStudent = async (studentId) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "StudentAppointmentsIndex",
      KeyConditionExpression:
        "GSI1PK = :student AND begins_with(GSI1SK, :prefix)",
      ExpressionAttributeValues: {
        ":student": `STUDENT#${studentId}`,
        ":prefix": "TIME#",
      },
    })
  );

  return result.Items || [];
};

export {
  createAppointment,
  getAppointmentsByProfessor,
  getAppointmentsByStudent,
};