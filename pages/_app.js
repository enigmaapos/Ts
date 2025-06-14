import '../styles/globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';


function MyApp({ Component, pageProps }) {
  return (
    <>
      <main className="min-h-screen p-6 flex justify-center items-start">
        
          <Component {...pageProps} />
        
      </main>
      <Analytics />
      <SpeedInsights />
    
    </>
  );
}

export default MyApp;
