var express = require('express');
var router = express.Router();
var bcrypt = require('bcrypt');
var saltRounds = 10;

// 응답 코드 정의
var ResponseType = {
  INVALID_EMAIL: 0,
  INVALID_PASSWORD: 1,
  SUCCESS: 2,
};

// 이메일 형식 검증 함수
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('respond with a resource');
});

// 회원가입
router.post('/signup', async function (req, res, next) {
  try {
    var email = req.body.email;
    var password = req.body.password;
    var nickname = req.body.nickname;

    if (!email || !password || !nickname) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ result: ResponseType.INVALID_EMAIL });
    }

    var database = req.app.get('database');
    var users = database.collection('users');

    var existingUser = await users.findOne({ _id: email });
    if (existingUser) {
      return res.status(409).json({ result: ResponseType.INVALID_EMAIL });
    }

    var salt = bcrypt.genSaltSync(saltRounds);
    var hash = bcrypt.hashSync(password, salt);

    await users.insertOne({
      _id: email, // 이메일을 _id로 저장
      password: hash,
      nickname: nickname,
      createdAt: new Date(),
    });

    res.status(201).json({ result: ResponseType.SUCCESS });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// 로그인
router.post('/signin', async function (req, res, next) {
  try {
    var email = req.body.email;
    var password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ result: ResponseType.INVALID_EMAIL });
    }

    var database = req.app.get('database');
    var users = database.collection('users');

    const existingUser = await users.findOne({ _id: email });
    if (existingUser) {
      const compareResult = await bcrypt.compare(password, existingUser.password);
      if (compareResult) {
        req.session.isAuthenticated = true;
        req.session.email = existingUser._id;
        req.session.nickname = existingUser.nickname;
        res.json({ result: ResponseType.SUCCESS });
      } else {
        res.status(401).json({ result: ResponseType.INVALID_PASSWORD });
      }
    } else {
      res.status(401).json({ result: ResponseType.INVALID_EMAIL });
    }
  } catch (error) {
    console.error('Error during signin:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;