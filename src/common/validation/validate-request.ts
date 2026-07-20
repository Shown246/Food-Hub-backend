import type { RequestHandler } from "express";
import { z } from "zod";
import { ValidationError, type ErrorFields } from "../errors/app-error.js";

interface RequestSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

const issueFields = (error: z.ZodError): ErrorFields => {
  const fields: ErrorFields = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fields[key] ??= "Unknown field.";
      continue;
    }
    const path = issue.path.join(".") || "request";
    fields[path] ??= issue.message;
  }
  return fields;
};

export const validateRequest = (schemas: RequestSchemas): RequestHandler => (request, _response, next) => {
  try {
    if (schemas.body) request.body = schemas.body.parse(request.body);
    if (schemas.params) request.params = schemas.params.parse(request.params) as typeof request.params;
    if (schemas.query) {
      const query = schemas.query.parse(request.query);
      // Express 5 exposes req.query through a getter; shadow it with the validated value.
      Object.defineProperty(request, "query", { value: query, configurable: true, writable: true });
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(issueFields(error)));
      return;
    }
    next(error);
  }
};
