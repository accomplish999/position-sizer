export class InputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InputError";
    this.code = code;
  }
}

export function isInputError(err: unknown): err is InputError {
  return err instanceof InputError;
}
