// ranking/rankSystem.js

function updateRankAndPoints(user, isWin) {
  let { rank, points } = user;

  // 승리 패배 점수 반영
  points += isWin ? 1 : -1;

  // 급수별 포인트
  let maxPoints = 3; // 기본: 10 ~ 18급
  if (rank >= 5 && rank <= 9) maxPoints = 5;
  else if (rank >= 1 && rank <= 4) maxPoints = 10;

  // 18급은 하락 제한
  if (rank === 18 && points < -3) points = -3;

  // 승급 처리
  if (points >= maxPoints) {
    if (rank > 1) { 
      rank -= 1;
      points = 0;
    }
  }

  // 강등 처리
  if (points <= -maxPoints) {
    if (rank < 18) { 
      rank += 1;
      points = 0;
    }
  }

  return { rank, points };
}

module.exports = { updateRankAndPoints };
