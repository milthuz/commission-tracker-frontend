import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DropdownNotification from './DropdownNotification';
import DropdownUser from './DropdownUser';

const Header = (props: {
  sidebarOpen: string | boolean | undefined;
  setSidebarOpen: (arg0: boolean) => void;
}) => {
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage and system preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return saved === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply dark mode on mount and when it changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
  };

  return (
    <header className="sticky top-0 z-999 flex w-full bg-white drop-shadow-1 dark:bg-boxdark dark:drop-shadow-none">
      <div className="flex flex-grow items-center justify-between px-4 py-4 shadow-2 md:px-6 2xl:px-11">
        <div className="flex items-center gap-2 sm:gap-4 lg:hidden">
          {/* <!-- Hamburger Toggle BTN --> */}
          <button
            aria-controls="sidebar"
            onClick={(e) => {
              e.stopPropagation();
              props.setSidebarOpen(!props.sidebarOpen);
            }}
            className="z-99999 block rounded-sm border border-stroke bg-white p-1.5 shadow-sm dark:border-strokedark dark:bg-boxdark lg:hidden"
          >
            <span className="relative block h-5.5 w-5.5 cursor-pointer">
              <span className="du-block absolute right-0 h-full w-full">
                <span
                  className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-black delay-[0] duration-200 ease-in-out dark:bg-white ${
                    !props.sidebarOpen && '!w-full delay-300'
                  }`}
                ></span>
                <span
                  className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-black delay-150 duration-200 ease-in-out dark:bg-white ${
                    !props.sidebarOpen && 'delay-400 !w-full'
                  }`}
                ></span>
                <span
                  className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-black delay-200 duration-200 ease-in-out dark:bg-white ${
                    !props.sidebarOpen && '!w-full delay-500'
                  }`}
                ></span>
              </span>
              <span className="absolute right-0 h-full w-full rotate-45">
                <span
                  className={`absolute left-2.5 top-0 block h-full w-0.5 rounded-sm bg-black delay-300 duration-200 ease-in-out dark:bg-white ${
                    !props.sidebarOpen && '!h-0 !delay-[0]'
                  }`}
                ></span>
                <span
                  className={`delay-400 absolute left-0 top-2.5 block h-0.5 w-full rounded-sm bg-black duration-200 ease-in-out dark:bg-white ${
                    !props.sidebarOpen && '!h-0 !delay-200'
                  }`}
                ></span>
              </span>
            </span>
          </button>
          {/* <!-- Hamburger Toggle BTN --> */}

          <Link className="block flex-shrink-0 lg:hidden" to="/">
            <span className="text-xl font-bold text-black dark:text-white">cluster</span>
          </Link>
        </div>

        <div className="hidden sm:block">
          {/* Empty div for spacing - you can add search or other elements here */}
        </div>

        <div className="flex items-center gap-3 2xsm:gap-7">
          <ul className="flex items-center gap-2 2xsm:gap-4">
            {/* <!-- Dark Mode Toggle --> */}
            <li>
              <button
                onClick={toggleDarkMode}
                className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                aria-label="Toggle dark mode"
              >
                {darkMode ? (
                  // Sun icon for light mode
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 0.5625C8.65625 0.5625 8.34375 0.84375 8.34375 1.21875V2.90625C8.34375 3.25 8.625 3.5625 9 3.5625C9.34375 3.5625 9.65625 3.28125 9.65625 2.90625V1.21875C9.65625 0.875 9.34375 0.5625 9 0.5625Z"
                      fill=""
                    />
                    <path
                      d="M13.2188 4.78125C12.9375 4.5 12.5313 4.5 12.25 4.78125C11.9688 5.0625 11.9688 5.46875 12.25 5.75L13.3438 6.84375C13.625 7.125 14.0313 7.125 14.3125 6.84375C14.5938 6.5625 14.5938 6.15625 14.3125 5.875L13.2188 4.78125Z"
                      fill=""
                    />
                    <path
                      d="M17.4375 8.34375H15.75C15.4063 8.34375 15.0938 8.625 15.0938 9C15.0938 9.34375 15.375 9.65625 15.75 9.65625H17.4375C17.7813 9.65625 18.0938 9.375 18.0938 9C18.0938 8.65625 17.7813 8.34375 17.4375 8.34375Z"
                      fill=""
                    />
                    <path
                      d="M13.2188 13.2188L14.3125 14.3125C14.5938 14.5938 15 14.5938 15.2813 14.3125C15.5625 14.0313 15.5625 13.625 15.2813 13.3438L14.1875 12.25C13.9063 11.9688 13.5 11.9688 13.2188 12.25C12.9375 12.5313 12.9375 12.9375 13.2188 13.2188Z"
                      fill=""
                    />
                    <path
                      d="M9 14.4375C8.65625 14.4375 8.34375 14.7188 8.34375 15.0938V16.7813C8.34375 17.125 8.625 17.4375 9 17.4375C9.34375 17.4375 9.65625 17.1563 9.65625 16.7813V15.0938C9.65625 14.75 9.34375 14.4375 9 14.4375Z"
                      fill=""
                    />
                    <path
                      d="M4.78125 13.2188C4.5 12.9375 4.09375 12.9375 3.8125 13.2188L2.71875 14.3125C2.4375 14.5938 2.4375 15 2.71875 15.2813C3 15.5625 3.40625 15.5625 3.6875 15.2813L4.78125 14.1875C5.0625 13.9063 5.0625 13.5 4.78125 13.2188Z"
                      fill=""
                    />
                    <path
                      d="M3.5625 9C3.5625 8.65625 3.28125 8.34375 2.90625 8.34375H1.21875C0.875 8.34375 0.5625 8.625 0.5625 9C0.5625 9.34375 0.84375 9.65625 1.21875 9.65625H2.90625C3.25 9.65625 3.5625 9.375 3.5625 9Z"
                      fill=""
                    />
                    <path
                      d="M4.78125 4.78125L3.6875 3.6875C3.40625 3.40625 3 3.40625 2.71875 3.6875C2.4375 3.96875 2.4375 4.375 2.71875 4.65625L3.8125 5.75C4.09375 6.03125 4.5 6.03125 4.78125 5.75C5.0625 5.46875 5.0625 5.0625 4.78125 4.78125Z"
                      fill=""
                    />
                    <path
                      d="M9 5.0625C6.71875 5.0625 4.90625 6.90625 4.90625 9.1875C4.90625 11.4688 6.75 13.3125 9.03125 13.3125C11.3125 13.3125 13.1562 11.4688 13.1562 9.1875C13.125 6.90625 11.2813 5.0625 9 5.0625ZM9 11.9688C7.46875 11.9688 6.25 10.75 6.25 9.21875C6.25 7.6875 7.46875 6.46875 9 6.46875C10.5313 6.46875 11.75 7.6875 11.75 9.21875C11.75 10.75 10.5313 11.9688 9 11.9688Z"
                      fill=""
                    />
                  </svg>
                ) : (
                  // Moon icon for dark mode
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15.7969 8.90625C15.6094 8.71875 15.3281 8.625 15.0469 8.6875C14.7656 8.71875 14.5156 8.90625 14.3906 9.1875C13.7344 10.7188 12.1719 11.7188 10.4219 11.7188C8.10938 11.7188 6.25 9.85938 6.25 7.54688C6.25 5.79688 7.25 4.23438 8.78125 3.57812C9.0625 3.45312 9.25 3.20312 9.28125 2.92188C9.3125 2.64062 9.21875 2.35938 9.03125 2.17188C8.84375 1.98438 8.5625 1.89062 8.28125 1.92188C4.65625 2.39062 2 5.5 2 9.1875C2 13.2188 5.28125 16.5 9.3125 16.5C12.9688 16.5 16.0781 13.875 16.5781 10.2812C16.6094 10 16.5156 9.71875 16.3281 9.53125C16.1719 9.34375 15.9844 9.21875 15.7969 8.90625Z"
                      fill=""
                    />
                  </svg>
                )}
              </button>
            </li>
            {/* <!-- Dark Mode Toggle --> */}

            {/* <!-- Notification Menu Area --> */}
            <DropdownNotification />
            {/* <!-- Notification Menu Area --> */}
          </ul>

          {/* <!-- User Area --> */}
          <DropdownUser />
          {/* <!-- User Area --> */}
        </div>
      </div>
    </header>
  );
};

export default Header;
