const { Contact } = require('../models/contact');
const { HttpError, ctrlWrapper } = require('../helpers');

const getAll = async (req, res) => {
  const { page = 1, limit = 20, favorite } = req.query;
  const skip = (page - 1) * limit;
  const query = {};
  query.owner = req.user._id;

  if (favorite) {
    query.favorite = favorite;
  }

  const allContacts = await Contact.find(query, '-createdAt -updatedAt', {
    skip,
    limit,
  }).populate('owner', 'name email');

  res.json(allContacts);
};

const getById = async (req, res) => {
  const { contactId } = req.params;
  const findingContact = await Contact.findById(contactId);

  // Від запитів на пошук контактів іншого користувача
  if (!findingContact || findingContact.owner.toString() !== req.user.id) {
    throw HttpError(404, 'Not found');
  }

  res.json(findingContact);
};

const add = async (req, res) => {
  const { _id: owner } = req.user;
  const newContact = await Contact.create({ ...req.body, owner });
  res.status(201).json(newContact);
};

const updateById = async (req, res) => {
  const { contactId } = req.params;
  const updatedContact = await Contact.findByIdAndUpdate(contactId, req.body, {
    new: true,
  });

  if (!updatedContact || updatedContact.owner.toString() !== req.user.id) {
    throw HttpError(404, 'Not found');
  }

  res.json(updatedContact);
};

const updateStatusContact = async (req, res) => {
  const { contactId } = req.params;
  const updatedContact = await Contact.findByIdAndUpdate(contactId, req.body, {
    new: true,
  });

  if (!updatedContact || updatedContact.owner.toString() !== req.user.id) {
    throw HttpError(404, 'Not found');
  }

  res.json(updatedContact);
};

const deleteById = async (req, res) => {
  const { contactId } = req.params;

  const deletedContact = await Contact.findByIdAndDelete(contactId);

  if (!deletedContact || deletedContact.owner.toString() !== req.user.id) {
    throw HttpError(404, 'Not found');
  }

  res.status(200).json('Contact deleted');
};

module.exports = {
  getAll: ctrlWrapper(getAll),
  getById: ctrlWrapper(getById),
  add: ctrlWrapper(add),
  updateById: ctrlWrapper(updateById),
  updateStatusContact: ctrlWrapper(updateStatusContact),
  deleteById: ctrlWrapper(deleteById),
};
