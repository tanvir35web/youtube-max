const { handleDownload } = require('./stream');

module.exports = async (req, res) => {
  return handleDownload(req, res);
};

