export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.code = 404;
  next(error);
};

export const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.code || res.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
};