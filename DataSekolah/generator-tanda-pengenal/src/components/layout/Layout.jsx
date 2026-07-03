import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children, title, subtitle }) => {
  return (
    <div className="schoolhub-generator min-h-screen bg-[#16181c] text-[#f0ede8]">
      {/* Sidebar */}
      <a
        href="/admin/master-data"
        className="generator-return-link no-print"
        aria-label="Kembali ke Akun dan Data Sekolah SIAB2"
      >
        ← Kembali ke SIAB2
      </a>
      <Sidebar />

      {/* Main Content */}
      <div className="generator-main ml-64 min-h-screen flex flex-col">
        {/* Header */}
        <Header title={title} subtitle={subtitle} />

        {/* Page Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
