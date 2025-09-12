var express = require('express');
var router = express.Router();
const { updateRankAndPoints } = require('../ranking/rankSystem');

// 게임 결과 저장 API
router.post('/result', async function(req, res) {
  try {
    const database = req.app.get('database');
    const users = database.collection('users');

    // 클라이언트에서 보낸 데이터
    const { winner, loser } = req.body;

    // 승자 정보 가져오기
    let winnerUser = await users.findOne({ _id: winner });
    let updatedWinner = updateRankAndPoints(winnerUser, true);

    // 패자 정보 가져오기
    let loserUser = await users.findOne({ _id: loser });
    let updatedLoser = updateRankAndPoints(loserUser, false);

    // DB 업데이트 (승자)
    await users.updateOne(
      { _id: winner },
      {
        $inc: { wins: 1 },
        $set: {
          rank: updatedWinner.rank,
          points: updatedWinner.points
        }
      }
    );

    // DB 업데이트 (패자)
    await users.updateOne(
      { _id: loser },
      {
        $inc: { losses: 1 },
        $set: {
          rank: updatedLoser.rank,
          points: updatedLoser.points
        }
      }
    );

    res.json({
      result: "success",
      winner: updatedWinner,
      loser: updatedLoser
    });
  } catch (error) {
    console.error('Error updating game result:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
