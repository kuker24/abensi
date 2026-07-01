import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen bg-[#05070a] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_22%_0%,rgba(111,166,216,0.18),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(64,102,130,0.18),transparent_30%)]" />
      <Sidebar />

      <div className="relative ml-64 min-h-screen">
        <Header title={title} subtitle={subtitle} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
