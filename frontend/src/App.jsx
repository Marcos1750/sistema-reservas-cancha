import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import Reservas from './Login';
import PanelAdmin from './PanelAdmin';
import Planes from './Planes';
import { ToastProvider } from './components/motion/animated-toast-stack';

function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <ConfirmDialogProvider>
        <Routes>
          <Route path="/admin" element={<PanelAdmin />} />
          <Route path="/planes" element={<Planes />} />
          <Route path="/*" element={<Reservas />} />
        </Routes>
      </ConfirmDialogProvider>
    </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
