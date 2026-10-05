const express = require("express");

const healthRoutes = require("./routes/health.route");
const authRoutes = require("./routes/auth.route");
const userRoutes = require('./routes/user.route');
const projectRoutes = require('./routes/project.route');
const taskRoutes = require('./routes/task.route');
const errorHandler = require("./middleware/error.middleware");
const notFound = require("./middleware/not-found");

const app = express();

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use(errorHandler);

app.use(notFound);

module.exports = app;