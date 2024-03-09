const { HttpError } = require('../helpers');

const validateBody = (schema, word) => {
  const func = (req, res, next) => {
    const { error } = schema.validate(req.body);

    if (error) {
      if (error.message === `${word} is required`) {
        next(HttpError(400, `missing field ${word}`));
      }

      next(HttpError(400, 'missing fields'));
    }
    next();
  };

  return func;
};

module.exports = validateBody;
