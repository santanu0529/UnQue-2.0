export class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;

    Error.captureStackTrace?.(this, HttpError);
  }
}