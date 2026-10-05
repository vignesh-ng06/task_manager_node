const getHealth = (req, res) => {
  res.json({
    success: true,
    message: "Workflow API is running",
  });
};

module.exports = {
  getHealth,
};