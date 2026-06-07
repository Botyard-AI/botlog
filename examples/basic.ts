import { Botlog } from "../src/index.js";

const botlog = new Botlog({ title: "Botlog example" });
const stream = botlog.createStream("example");

stream.info("Starting example stream");
stream.write("Open the browser and watch this log update.");

botlog.listen({ port: 3030 });

let count = 0;
setInterval(() => {
  count += 1;
  stream.write(`tick ${String(count)}`);
}, 1000);
