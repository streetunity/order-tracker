export const dynamic = 'force-dynamic';

export default function KioskLayout({ children }) {
  // No nav, no extra chrome — kiosk mode
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: 'black' }}>
        {children}
      </body>
    </html>
  );
}
