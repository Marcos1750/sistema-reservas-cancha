import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Reservas from './Login';
import PanelAdmin from './PanelAdmin';
import Planes from './Planes';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Reservas />} />
        <Route path="/admin" element={<PanelAdmin />} />
        <Route path="/planes" element={<Planes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
