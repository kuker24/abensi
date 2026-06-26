import AcademicModules from './siab2-preview/AcademicModules';
import AcademicParallax from './siab2-preview/AcademicParallax';
import ContactFooter from './siab2-preview/ContactFooter';
import DashboardPreview from './siab2-preview/DashboardPreview';
import Hero from './siab2-preview/Hero';
import Navbar from './siab2-preview/Navbar';
import RoleJourney from './siab2-preview/RoleJourney';
import StatsSection from './siab2-preview/StatsSection';

export default function SIAB2PreviewLanding() {
  return (
    <main className="siab2-preview" aria-label="SIAB2 Sistem Informasi Akademik Berkarakter">
      <Navbar />
      <Hero />
      <AcademicModules />
      <RoleJourney />
      <DashboardPreview />
      <AcademicParallax />
      <StatsSection />
      <ContactFooter />
    </main>
  );
}
