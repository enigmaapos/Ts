import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="UTF-8" />
        <meta name="description" content="Bitcoin Signal Analyzer – EMA, ATH, ATL based bullish/bearish signals for crypto traders." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/favicon.ico" />
        <title>Bitcoin Signal Analyzer</title>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
    }
