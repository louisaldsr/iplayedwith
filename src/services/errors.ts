/** Base class for errors that should be translated to a specific HTTP status. */
export class ServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 400)
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404)
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 409)
  }
}
