export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly code?: string;

    constructor(statusCode: number, message: string, isOperational = true, code?: string) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code;
        Object.setPrototypeOf(this, ApiError.prototype);
    }

    static badRequest(message: string) {
        return new ApiError(400, message);
    }

    static paymentRequired(message: string = "Payment Required") {
        return new ApiError(402, message);
    }

    static unauthorized(message: string = "Unauthorized") {
        return new ApiError(401, message);
    }

    static forbidden(message: string = "Forbidden", code?: string) {
        return new ApiError(403, message, true, code);
    }

    static notFound(message: string = "Not found") {
        return new ApiError(404, message);
    }

    static conflict(message: string) {
        return new ApiError(409, message);
    }

    static internal(message: string = "Internal server error") {
        return new ApiError(500, message, false);
    }
}
