export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  res.status(statusCode);
  const payload = {
    message: err.message || 'Server error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  };
  if (err.existingRecord) {
    payload.existingRecord = err.existingRecord;
  }
  if (err.code === 11000) {
    payload.message = 'Duplicate phone number is not allowed';
  }
  res.json(payload);
};

