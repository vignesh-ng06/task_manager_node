const app = require("./app");

require("dotenv").config();


const PORT = process.env.PORT || 5000;


// app.post("/api/users", (req, res) => {
//   const {name , email, role } = req.body;
//   if (!name || !email || !role) {
//     return res.status(400).json({ message: "Please provide name, email, and role" });
//   }
//   res.status(201).json({ 
//      success: true,
//      message: "User created successfully",
//      user: { name, email, role } });
// });


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT} on all network interfaces`);
});