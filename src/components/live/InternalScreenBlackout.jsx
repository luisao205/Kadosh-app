const InternalScreenBlackout = ({ active }) => active ? <div className="fixed inset-0 z-[200] h-[100dvh] w-screen bg-black" aria-label="Pantalla apagada" /> : null;

export default InternalScreenBlackout;
