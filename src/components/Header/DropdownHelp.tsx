import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const DropdownHelp = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const trigger = useRef<any>(null);
  const dropdown = useRef<any>(null);

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // close if the esc key is pressed
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
      <Link
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        to="#"
        className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
      >
        <svg
          className="fill-current"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.00039 0.506348C4.30039 0.506348 0.506836 4.29385 0.506836 8.99385C0.506836 13.6939 4.29434 17.4876 9.00039 17.4876C13.7004 17.4876 17.4941 13.6939 17.4941 8.99385C17.4879 4.29385 13.7004 0.506348 9.00039 0.506348ZM9.00039 15.6814C5.30039 15.6814 2.31289 12.6939 2.31289 8.99385C2.31289 5.29385 5.30039 2.30635 9.00039 2.30635C12.7004 2.30635 15.6879 5.29385 15.6879 8.99385C15.6879 12.6939 12.7004 15.6814 9.00039 15.6814Z"
            fill=""
          />
          <path
            d="M9 6.75C8.5875 6.75 8.25 7.0875 8.25 7.5V12C8.25 12.4125 8.5875 12.75 9 12.75C9.4125 12.75 9.75 12.4125 9.75 12V7.5C9.75 7.0875 9.4125 6.75 9 6.75Z"
            fill=""
          />
          <path
            d="M9 4.5C8.5875 4.5 8.25 4.8375 8.25 5.25C8.25 5.6625 8.5875 6 9 6C9.4125 6 9.75 5.6625 9.75 5.25C9.75 4.8375 9.4125 4.5 9 4.5Z"
            fill=""
          />
        </svg>
      </Link>

      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute -right-16 mt-2.5 flex w-75 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0 sm:w-80 ${
          dropdownOpen === true ? 'block' : 'hidden'
        }`}
      >
        <div className="px-4.5 py-3">
          <h5 className="text-sm font-medium text-bodydark2">Help & Info</h5>
        </div>

        <ul className="flex h-auto flex-col overflow-y-auto">
          <li>
            <Link
              className="flex gap-4.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              to="/versions"
              onClick={() => setDropdownOpen(false)}
            >
              <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-3">
                <svg
                  className="fill-white"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 0.5625C4.27969 0.5625 0.5625 4.27969 0.5625 9C0.5625 13.7203 4.27969 17.4375 9 17.4375C13.7203 17.4375 17.4375 13.7203 17.4375 9C17.4375 4.27969 13.7203 0.5625 9 0.5625ZM9 15.8438C5.17031 15.8438 2.15625 12.8297 2.15625 9C2.15625 5.17031 5.17031 2.15625 9 2.15625C12.8297 2.15625 15.8438 5.17031 15.8438 9C15.8438 12.8297 12.8297 15.8438 9 15.8438Z"
                    fill=""
                  />
                  <path
                    d="M9 4.5C8.68594 4.5 8.4375 4.74844 8.4375 5.0625V9.5625C8.4375 9.87656 8.68594 10.125 9 10.125C9.31406 10.125 9.5625 9.87656 9.5625 9.5625V5.0625C9.5625 4.74844 9.31406 4.5 9 4.5Z"
                    fill=""
                  />
                </svg>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-medium text-black dark:text-white">
                  Version History
                </span>
                <span className="text-sm">View release notes and updates</span>
              </div>
            </Link>
          </li>

          <li>
            <a
              className="flex gap-4.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              href="mailto:david@clustersystems.com?subject=Commission Tracker Support Request"
            >
              <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-5">
                <svg
                  className="fill-white"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 0.5625C4.27969 0.5625 0.5625 4.27969 0.5625 9C0.5625 13.7203 4.27969 17.4375 9 17.4375C13.7203 17.4375 17.4375 13.7203 17.4375 9C17.4375 4.27969 13.7203 0.5625 9 0.5625ZM9 15.8438C5.17031 15.8438 2.15625 12.8297 2.15625 9C2.15625 5.17031 5.17031 2.15625 9 2.15625C12.8297 2.15625 15.8438 5.17031 15.8438 9C15.8438 12.8297 12.8297 15.8438 9 15.8438Z"
                    fill=""
                  />
                  <path
                    d="M9 7.875C8.68594 7.875 8.4375 8.12344 8.4375 8.4375V12.9375C8.4375 13.2516 8.68594 13.5 9 13.5C9.31406 13.5 9.5625 13.2516 9.5625 12.9375V8.4375C9.5625 8.12344 9.31406 7.875 9 7.875Z"
                    fill=""
                  />
                  <path
                    d="M9 5.0625C8.68594 5.0625 8.4375 5.31094 8.4375 5.625C8.4375 5.93906 8.68594 6.1875 9 6.1875C9.31406 6.1875 9.5625 5.93906 9.5625 5.625C9.5625 5.31094 9.31406 5.0625 9 5.0625Z"
                    fill=""
                  />
                </svg>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-medium text-black dark:text-white">
                  Support
                </span>
                <span className="text-sm">david@clustersystems.com</span>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </li>
  );
};

export default DropdownHelp;
