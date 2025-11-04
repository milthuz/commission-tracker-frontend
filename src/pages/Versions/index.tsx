const Versions = () => {
  return (
    <div style={{ padding: '2rem', background: 'white', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'black' }}>
        Version History TEST
      </h1>
      <p style={{ color: 'black' }}>If you can see this, routing is working!</p>
      
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'black' }}>Version 0.2.3</h2>
        <p style={{ color: 'black' }}>Current Release - November 3, 2025</p>
        <ul style={{ marginTop: '1rem', color: 'black' }}>
          <li>✓ Authentication working</li>
          <li>✓ User profile with photo</li>
          <li>✓ JWT token management</li>
        </ul>
      </div>
    </div>
  );
};

export default Versions;
