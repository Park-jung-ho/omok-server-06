var express = require('express');
var router = express.Router();
router.get('/', async function (req, res) {
  const database = req.app.get('database');
  const users = database.collection('users');

  const ranking = await users.find({}, { projection: { password: 0 } }) // 비밀번호는 빼고 보내야 해서 0.
                             .sort({ rank: 1, points: -1, wins: -1 })
                             .limit(10)
                             .toArray();

  res.json(ranking);
});
