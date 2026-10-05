const app = require("./app");

require("dotenv").config();


const PORT = process.env.PORT || 5000;


//middleware
// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.url}`);
//   next();
// });


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


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});