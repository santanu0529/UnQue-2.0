import { randomUUID } from "crypto";

import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import { docClient } from "../config/dynamodb.js";

const TABLE_NAME =
  process.env.DYNAMODB_AVAILABILITY_TABLE || "UnQueAvailability";

// Add professor availability
const createAvailability = async ({
  professorId,
  startTime,
  endTime,
}) => {
  const availability = {
    professorId,
    availabilityId: randomUUID(),
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: availability,
    })
  );

  return availability;
};

// Get all availability slots of a professor
const getAvailabilityByProfessor = async (professorId) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "professorId = :professorId",
      ExpressionAttributeValues: {
        ":professorId": professorId,
      },
    })
  );

  return result.Items || [];
};

// Find an availability slot by its ID
const getAvailabilityById = async (professorId, availabilityId) => {
  const slots = await getAvailabilityByProfessor(professorId);

  return slots.find(
    (slot) => slot.availabilityId === availabilityId
  ) || null;
};

// Update availability timing
const updateAvailability = async ({
  professorId,
  availabilityId,
  startTime,
  endTime,
}) => {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        professorId,
        availabilityId,
      },
      UpdateExpression:
        "SET startTime = :start, endTime = :end, updatedAt = :updated",
      ConditionExpression: "attribute_exists(availabilityId)",
      ExpressionAttributeValues: {
        ":start": new Date(startTime).toISOString(),
        ":end": new Date(endTime).toISOString(),
        ":updated": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

// Delete an availability slot
const deleteAvailability = async (professorId, availabilityId) => {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        professorId,
        availabilityId,
      },
    })
  );
};

export {
  createAvailability,
  getAvailabilityByProfessor,
  getAvailabilityById,
  updateAvailability,
  deleteAvailability,
};