export type ErrorFields = Record<string, string>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: ErrorFields;

  constructor(statusCode: number, code: string, message: string, fields?: ErrorFields) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "The request could not be processed.", code = "BAD_REQUEST") {
    super(400, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.", code = "UNAUTHORIZED") {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.", code = "FORBIDDEN") {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.", code = "NOT_FOUND") {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current resource state.", code = "CONFLICT") {
    super(409, code, message);
  }
}

export class ValidationError extends AppError {
  constructor(fields: ErrorFields, message = "The request contains invalid data.") {
    super(422, "VALIDATION_ERROR", message, fields);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "The service is temporarily unavailable.") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}
