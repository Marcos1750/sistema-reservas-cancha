import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import Reservas from './Login';
import PanelAdmin from './PanelAdmin';
import Planes from './Planes';

function App() {
  return (
    <BrowserRouter>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/" element={<Reservas />} />
          <Route path="/complejos/:slug" element={<Reservas />} />
          <Route path="/admin" element={<PanelAdmin />} />
          <Route path="/planes" element={<Planes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfirmDialogProvider>
    </BrowserRouter>
  );
}

export default App;
