import '../styles/globals.css';
import Navbar from '../components/Navbar';
import FloatingButton from '../components/FloatingButton';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';


function MyApp({ Component, pageProps }) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen p-6 flex justify-center items-start">
        
          <Component {...pageProps} />
        
      </main>
      <FloatingButton />
      <Analytics />
      <SpeedInsights />
    
    </>
  );
}

export default MyApp;
