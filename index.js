var express = require('express');
var mqtt = require('mqtt');
var mysql = require('mysql2');
var { createServer } = require('http');
var { Server } = require('socket.io');
const { time } = require('console');
const {
	CLOSE_REASON_POLICY_VIOLATION,
} = require('websocket/lib/WebSocketConnection');
var app = express();
var port = 8888;

app.use(express.static('public'));
app.set('views engine', 'ejs');
app.set('views', './views');

//cap nhat du lieu gan nhat tu database
app.get('/', function (req, res) {
	con.query(
		'SELECT cast(date as char(10)) as date, cast(date as time) as time,humidity,temperature,light,relay1,relay2,relay3,relay4 FROM iot_database.sensorhtn ORDER BY id desc LIMIT 1',
		function (err, result) {
			res.render('home.ejs', { data: result[0] });
		}
	);
});


app.get('/history', async function (req, res) {
	let page = req.query.page || 1;
	let perPage = 20;
	let offset = (page - 1) * perPage;
	let query = `SELECT id,cast(date as char(20)) as date ,temperature,humidity, light FROM sensorhtn order by id desc LIMIT ${perPage} OFFSET ${offset}`;
	con.query('SELECT COUNT(id) as COUNT FROM sensorhtn', function (err, result) {
		let pages = Math.ceil(result[0].COUNT / perPage);
		con.query(query, function (err, data) {
			res.render('history.ejs', { pages: pages, current: page, data: data });
		});
	});
});

var httpServer = createServer(app);

var io = new Server(httpServer);
httpServer.listen(port);

// SQL--------Temporarily use PHPMyAdmin------------------------------
var con = mysql.createConnection({
	host: 'localhost',
	port: 3306,
	user: 'root',
	password: '123456',
	database: 'htn_database',
});
//---------------------------------------------CREATE TABLE-------------------------------------------------

con.connect(function (err) {
	if (err) throw err;
	console.log('mysql connected');

	var sql = `CREATE TABLE IF NOT EXISTS sensorhtn (
            id INT(11) AUTO_INCREMENT PRIMARY KEY,
            date DATETIME, 
            humidity INT(3), 
            temperature INT(3),
            light INT(3),
            relay1 varchar(3),
            relay2 varchar(3),
			relay3 varchar(3),
			relay4 varchar(3)
        )`;
	con.query(sql, function (err) {
		if (err) throw err;
		console.log('Table created');
	});
});

//----------------------MQTT-------------------------
var options = {
	host: 'broker.emqx.io',
	port: 8883,
	protocol: 'mqtts',
	username: '',
	password: '',
};

var msg;
var client = mqtt.connect(options);
var topicSensor = 'esp8266_htn_sensor';
var topicRelay1 = 'esp8266_htn_relay1';
var topicRelay2 = 'esp8266_htn_relay2';
var topicRelay3 = 'esp8266_htn_relay3';
var topicRelay4 = 'esp8266_htn_relay4';

client.subscribe(topicSensor);
client.subscribe(topicRelay1);
client.subscribe(topicRelay2);
client.subscribe(topicRelay3);
client.subscribe(topicRelay4);
//-------------------------------------------------------
io.on('connection', (socket) => {
	console.log(socket.id);
	console.log('a user connected');
	socket.on('disconnect', () => {
		console.log('user disconnected');
	});
	// nhan du lieu led tu client va gui yeu cau qua MQTT
	socket.on('changeRelayState', function ({ RelayName, state }) {
		let relayTopicName;
		switch (RelayName) {
			case 'relay1':
				relayTopicName = topicRelay1;
				break;
			case 'relay2':
				relayTopicName = topicRelay2;
				break;
			case 'relay3':
				relayTopicName = topicRelay3;
				break;
			case 'relay4':
				relayTopicName = topicRelay4;
				break;
		}
		if (state == 'on') {
			client.publish(relayTopicName, 'on');
			console.log(relayTopicName + ' on');
		} else {
			client.publish(relayTopicName, 'off');
			console.log(relayTopicName + ' off');
		}
	});
	socket.on('laygio', function () {
		var sqlDataDayHour =
			'Select TABLEDATA.day ,TABLEDATA.hour, avg(humidity) as humidity , avg(temperature) as temperature, avg(light)   as light  from (Select id,date,EXTRACT(hour from date) as hour,EXTRACT(day from date) as day,EXTRACT(MONTH FROM date) AS month,humidity,temperature,light from sensorhtn where 	 EXTRACT(MONTH from date ) = EXTRACT(MONTH  from sysdate()) and 	EXTRACT(year From date) = EXTRACT(year FROM sysdate())) as TABLEDATA GROUP BY  TABLEDATA.HOUR,TABLEDATA.day, TABLEDATA.month';
		con.query(sqlDataDayHour, function (err, result) {
			socket.emit('tragio', result);
		});
	});
	socket.on('layngay', function () {
		var sqlDataDay =
			'Select TABLEDATA.day ,TABLEDATA.hour, avg(humidity) as humidity , avg(temperature) as temperature, avg(light)   as light   from (Select id,date,EXTRACT(day from date) as day, EXTRACT(hour from date) as hour, EXTRACT(MONTH FROM date) AS month, humidity,temperature,light from sensorhtn where EXTRACT(MONTH from date ) = EXTRACT(MONTH  from sysdate()) and 	EXTRACT(year From date) = EXTRACT(year FROM sysdate()) ) as TABLEDATA GROUP BY  TABLEDATA.day, TABLEDATA.month';
		con.query(sqlDataDay, function (err, result) {
			socket.emit('trangay', result);
		});
	});
});

// ('Select id,date ,TABLEDATA.day ,TABLEDATA.hour, avg(humidity) as humidity , avg(temperature) as temperature, avg(light)   as light  from (Select id,date,EXTRACT(hour from date) as hour,EXTRACT(day from date) as day,humidity,temperature,light from sensors where 	-- EXTRACT(day from date ) = EXTRACT(day from sysdate()) EXTRACT(MONTH from date ) = EXTRACT(MONTH  from sysdate()) and 	EXTRACT(year From date) = EXTRACT(year FROM sysdate()) ) as TABLEDATA GROUP BY  TABLEDATA.HOUR');

//setup the callbacks
client.on('connect', function () {
	console.log('Connected to MQTT broker');
});

client.on('error', function (error) {
	console.log(error);
});

client.on('message', function (topic, message) {
	//Called each time a message is received
	//console.log('Received message:', topic, message.toString());
	msg = message;
	if (topic == topicSensor) {
		io.emit('sensor', msg.toString());
		const objData = JSON.parse(msg.toString());
		var newDate = objData.d;
		var newHumidity = objData.h;
		var newTemp = objData.t;
		var newLight = objData.l;
		var newRelay1 = objData.r1;
		var newRelay2 = objData.r2;
		var newRelay3 = objData.r3;
		var newRelay4 = objData.r4;
		// let date = newDate.split('T')[0];
		if (newDate == '0') {
			newDate = 'Fri Mar 11 01:58:24 2022';
		}
		var date1 = new Date(newDate);
		date1 = date1.toISOString();
		let date = date1.split('T')[0];
		let time = newDate.split(' ')[3];
		date_and_time = date + ' ' + time;
		console.log(date_and_time);
		var sql = `INSERT INTO sensorhtn (date, humidity, temperature, light, relay1, relay2, relay3,relay4)
			VALUES ("${date_and_time}",${newHumidity},${newTemp},${newLight},'${newRelay1}','${newRelay2}','${newRelay3}','${newRelay4}')`;
		con.query(sql, function (err) {
			if (err) throw err;
			//console.log('Table inserted');
		});
		var sqlDelete =
			'DELETE  FROM iot_database.sensorhtn WHERE humidity =0 or temperature =0;';
		if (newHumidity == 0 || newHumidity == 0) {
			con.query(sqlDelete, function () {
				console.log('xoa du lieu loi thanh cong');
			});
		}
	}
});
