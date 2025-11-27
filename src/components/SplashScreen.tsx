// import logo from "../assets/images/logo.png";
import earth from "../assets/images/earth.png";

export function SplashScreen() {
  return (
    <>
      <div className="splash-screen" role="status" aria-label="Loading">
        <div className="splash-logo relative w-full">
          {/* <img src={logo} alt="SyntraIQ logo" /> */}
          <h1 className="font-ubuntu text-4xl font-bold translate-y-1">
            Syntra <span className="text-gold font-bold!">IQ</span>
          </h1>
          <div className="relative mb-5">
            <div className="bg-gradient-to-b from-transparent to-[#F8F7F4] dark:to-[#0E0E0E] absolute top-0 left-0 w-full h-full"/>
            <img src={earth} alt="Earth" className="w-full object-cover" />
          </div>
        </div>
        <p className="splash-tagline font-ubuntu text-lg! font-medium">
          Preparing your Syntra<span className="text-gold">IQ</span> experience…
        </p>
      </div>
    </>
  );
}
