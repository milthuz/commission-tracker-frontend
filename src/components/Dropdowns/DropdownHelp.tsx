import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface DropdownHelpProps {
  sidebarOpen: string | boolean | undefined;
}

const DropdownHelp: React.FC<DropdownHelpProps> = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target as Node) ||
        trigger.current?.contains(target as Node)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // Close on ESC
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!dropdownOpen || keyCode !== 27) return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  return (
    <li className="relative">
      <button
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative flex items-center justify-center h-8.5 w-8.5 rounded-full border border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
        title="Help & Settings"
      >
        <svg
          className="fill-current duration-300 ease-in-out"
          height="18"
          width="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 0C4.02562 0 0 4.02562 0 9C0 13.9744 4.02562 18 9 18C13.9744 18 18 13.9744 18 9C18 4.02562 13.9744 0 9 0ZM9 16.2C5.10469 16.2 2.77969 13.875 2.77969 9.97969C2.77969 6.08438 5.10469 3.75937 9 3.75937C12.8953 3.75937 15.2203 6.08438 15.2203 9.97969C15.2203 13.875 12.8953 16.2 9 16.2Z"
            fill=""
          />
          <path
            d="M9.375 5.625H8.53125C8.27187 5.625 8.0625 5.83437 8.0625 6.09375V6.84375C8.0625 7.10312 8.27187 7.3125 8.53125 7.3125H9.375C10.3281 7.3125 11.1094 8.09375 11.1094 9.04688V10.0875C11.1094 11.0406 10.3281 11.8219 9.375 11.8219H8.53125C8.27187 11.8219 8.0625 12.0313 8.0625 12.2906V12.8156C8.0625 13.075 8.27187 13.2844 8.53125 13.2844H9.375C11.2344 13.2844 12.7875 11.7313 12.7875 9.87188V9.09375C12.7875 7.23438 11.2344 5.625 9.375 5.625Z"
            fill=""
          />
          <path
            d="M9 14.0625C8.625 14.0625 8.3125 14.375 8.3125 14.75C8.3125 15.125 8.625 15.4375 9 15.4375C9.375 15.4375 9.6875 15.125 9.6875 14.75C9.6875 14.375 9.375 14.0625 9 14.0625Z"
            fill=""
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute -right-16 mt-2 flex h-auto w-48 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0 sm:w-56 ${
          dropdownOpen === true ? 'block' : 'hidden'
        }`}
      >
        <div className="px-4.5 py-3">
          <h5 className="text-sm font-medium text-bodydark2">Help & Settings</h5>
        </div>

        <ul className="flex flex-col overflow-y-auto">
          <li>
            <Link
              to="/versions"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 2H14C14.55 2 15 2.45 15 3V13C15 13.55 14.55 14 14 14H2C1.45 14 1 13.55 1 13V3C1 2.45 1.45 2 2 2Z"
                  fill=""
                />
                <path d="M2 2V1M14 2V1M2 14V15M14 14V15" stroke="" strokeWidth="1" />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Version History</p>
                <p className="text-xs">See what's new in each release</p>
              </div>
            </Link>
          </li>

          <li>
            <a
              href="https://github.com/milthuz/commission-tracker-frontend"
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.38 6.02 15.13C6.02 14.91 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.63C2.22 11.46 1.82 11.09 2.49 11.08C3.12 11.07 3.57 11.69 3.72 11.97C4.44 13.15 5.59 12.81 6.05 12.56C6.12 12.05 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.05 6.02 4.09C6.66 3.93 7.33 3.85 8 3.85C8.67 3.85 9.34 3.94 9.98 4.09C11.51 3.04 12.18 3.31 12.18 3.31C12.62 4.41 12.34 5.23 12.26 5.43C12.77 5.99 13.08 6.71 13.08 7.58C13.08 10.65 11.21 11.33 9.43 11.53C9.72 11.78 9.97 12.26 9.97 13.03C9.97 14.08 9.96 14.93 9.96 15.13C9.96 15.38 10.11 15.67 10.51 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
                  fill=""
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Github</p>
                <p className="text-xs">View on GitHub</p>
              </div>
            </a>
          </li>

          <li>
            <a
              href="mailto:support@cluster.com"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 2H14C14.55 2 15 2.45 15 3V13C15 13.55 14.55 14 14 14H2C1.45 14 1 13.55 1 13V3C1 2.45 1.45 2 2 2Z"
                  fill=""
                />
                <path
                  d="M14 3.5L8 8.5L2 3.5V3H14V3.5Z"
                  fill="white"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Support</p>
                <p className="text-xs">Contact us for help</p>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </li>
  );
};

export default DropdownHelp;
