const Versions = () => {
  return (
    <div className="p-10 bg-white min-h-screen">
      <div className="bg-blue-500 text-white p-8 rounded-lg">
        <h1 className="text-4xl font-bold mb-4">VERSION HISTORY - IT WORKS!</h1>
        <p className="text-xl">If you can see this blue box, routing is working!</p>
      </div>

      <div className="mt-8 p-6 border-4 border-green-500 rounded-lg bg-white">
        <h2 className="text-2xl font-bold text-black mb-4">Version 0.2.3 - Current</h2>
        <div className="text-black">
          <p>✅ Full Zoho OAuth authentication</p>
          <p>✅ User profile with photo</p>
          <p>✅ JWT token management</p>
          <p>✅ Secure login/logout</p>
        </div>
      </div>

      <div className="mt-8 p-6 bg-yellow-100 border-2 border-yellow-500 rounded-lg">
        <h3 className="text-xl font-bold text-black mb-2">🚀 Coming Soon</h3>
        <p className="text-black">→ Commission tracking dashboard</p>
        <p className="text-black">→ Invoice sync from Zoho Books</p>
        <p className="text-black">→ Sales rep management</p>
      </div>
    </div>
  );
};

export default Versions;
