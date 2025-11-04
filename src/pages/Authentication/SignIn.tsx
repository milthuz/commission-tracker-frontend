import { useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import LogoDark from '../../images/logo/cluster-on-dark.svg';
import LogoLight from '../../images/logo/cluster-on-light.svg';

const SignIn = () => {
  const [isDarkMode, _setIsDarkMode] = useState(false);

  return (
    <>
      <Breadcrumb pageName="Sign In" />

      <div className="flex flex-wrap items-center justify-center gap-7.5 sm:flex-nowrap lg:gap-12.5 2xl:gap-17.5">
        <div className="w-full border-stroke dark:border-strokedark xl:w-1/2 xl:border-r-2">
          <div className="w-full p-4 sm:p-12.5 xl:p-17.5">
            <span className="mb-1.5 block font-medium">Start for free</span>
            <h2 className="mb-9 text-2xl font-bold text-black dark:text-white sm:text-title-xl2">
              Sign in to Commission Tracker
            </h2>

            <form>
              <div className="mb-4">
                <label className="mb-3 block text-black dark:text-white">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 text-black outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                />
              </div>

              <div className="mb-6">
                <label className="mb-3 block text-black dark:text-white">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 text-black outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                />
              </div>

              <div className="mb-5">
                <input
                  type="checkbox"
                  id="checkboxLabel"
                  defaultChecked
                />
                <label htmlFor="checkboxLabel" className="cursor-pointer select-none pl-2">
                  Keep me logged in
                </label>
              </div>

              <button className="w-full rounded bg-primary p-3 font-medium text-gray hover:bg-opacity-90">
                Sign In
              </button>

              <div className="mt-6 flex items-center gap-3.5">
                <span className="inline-block h-px w-full bg-stroke dark:bg-strokedark"></span>
                <p>Or</p>
                <span className="inline-block h-px w-full bg-stroke dark:bg-strokedark"></span>
              </div>

              <button className="mb-5.5 mt-6.5 w-full rounded border border-stroke bg-gray p-4 font-medium text-black hover:shadow-1 dark:border-strokedark dark:bg-meta-4 dark:text-white">
                Sign in with Zoho
              </button>
            </form>

            <div className="mt-6 text-center">
              <p>
                Don't have an account?{' '}
                <Link to="/auth/signup" className="text-primary">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="hidden w-full p-4 md:block xl:w-1/2">
          <div className="overflow-hidden rounded-sm bg-black dark:drop-shadow-none">
            <div className="relative z-1 h-full bg-gradient-to-b from-transparent to-[rgba(74,130,255,0.5)] py-32 px-7.5 text-center sm:px-20">
              <div className="relative z-3 mb-8 inline-block">
                <img 
                  src={isDarkMode ? LogoDark : LogoLight}
                  alt="Cluster Logo" 
                  className="h-16 w-auto"
                />
              </div>

              <p className="relative z-3 mb-3.5 text-base font-medium text-white">
                Commission Tracker
              </p>
              <p className="relative z-3 text-sm font-medium text-white/60">
                Track your sales commissions with ease
              </p>

              <div className="absolute top-0 left-0 -z-1 h-full w-full">
                <span className="absolute top-0 left-0 inline-flex h-80 w-80 rounded-full bg-gradient-to-r from-[#224abe] to-[#7e22ce] blur-3xl"></span>
                <span className="absolute bottom-0 right-0 inline-flex h-80 w-80 rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#ec4899] blur-3xl"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SignIn;
