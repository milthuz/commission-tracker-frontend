import { useState } from 'react';

type ModalSettingsProps = {
  closeModal: () => void;
  onSubmit: (value: string) => void;
  defaultValue: string;
};

const ModalSettings: React.FC<ModalSettingsProps> = ({ closeModal, onSubmit, defaultValue }) => {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.currentTarget.className.includes('modal-overlay')) {
      closeModal();
    }
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-999999 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleOverlayClick}
    >
      <div className="modal-content rounded-lg bg-white p-6 shadow-lg dark:bg-boxdark">
        <h2 className="mb-4 text-xl font-bold text-black dark:text-white">Edit Setting</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            className="mb-4 w-full rounded border border-stroke px-4 py-2 dark:border-strokedark dark:bg-meta-4"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded bg-gray px-4 py-2 text-white hover:bg-opacity-90"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-white hover:bg-opacity-90"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalSettings;
