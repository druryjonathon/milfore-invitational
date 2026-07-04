import { Routes, Route } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Home } from "./pages/Home";
import { Tournaments } from "./pages/Tournaments";
import { TournamentDetail } from "./pages/TournamentDetail";
import { RoundDetail } from "./pages/RoundDetail";
import { MatchDetail } from "./pages/MatchDetail";
import { Players } from "./pages/Players";
import { PlayerDetail } from "./pages/PlayerDetail";
import { Records } from "./pages/Records";

function App() {
  return (
    <>
      <div className="pg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:year" element={<TournamentDetail />} />
          <Route path="/tournaments/:year/rounds/:roundId" element={<RoundDetail />} />
          <Route path="/tournaments/:year/rounds/:roundId/matches/:matchId" element={<MatchDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:playerId" element={<PlayerDetail />} />
          <Route path="/records" element={<Records />} />
        </Routes>
      </div>
      <BottomNav />
    </>
  );
}

export default App;
