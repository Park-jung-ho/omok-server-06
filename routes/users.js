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

/* GET users listing */
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
      _id: email,            // 이메일을 _id로 저장
      password: hash,        // 보안을 위해 해시
      nickname: nickname,
      createdAt: new Date(), // 가입 날짜 

      // 전적 관련 초기값
      wins: 0,
      losses: 0,
      points: 0,
      rank: 18
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
        // 세션 저장
        req.session.isAuthenticated = true;
        req.session.email = existingUser._id;
        req.session.nickname = existingUser.nickname;

        // 닉네임과 랭크까지 클라이언트에 내려줌
        res.json({
          result: ResponseType.SUCCESS,
          nickname: existingUser.nickname,
          rank: existingUser.rank
        });
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
