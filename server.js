const express = require("express");
const app = express();
const path = require("path");
app.use("/",express.static(path.join(__dirname,"./public")));
const port = 60000;
const address = 'localhost';
app.listen(port,address,()=>{
	console.log("http://"+address+":"+port);
});