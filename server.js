const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const app = express();
const path = require("path");
app.use("/",express.static(path.join(__dirname,"./public")));
app.use('/api', createProxyMiddleware({
	target: "http://localhost:59998/api",
	changeOrigin: true,
}));
const port = 60000;
const address = 'localhost';
app.listen(port,address,()=>{
	console.log("http://"+address+":"+port);
});
