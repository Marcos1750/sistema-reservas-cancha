import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Reservas from './Login';
import PanelAdmin from './PanelAdmin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Reservas />} />
        <Route path="/admin" element={<PanelAdmin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
