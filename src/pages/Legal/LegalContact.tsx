// Closing « contact us » line of the legal pages. The address lives inside each language's
// sentence; this turns it into a mailto: link so the reader can write to us in one click.
const EMAIL = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

const LegalContact = ({ text }: { text: string }) => (
  <p className="mt-8 border-t border-stroke pt-6 text-sm text-body dark:border-strokedark">
    {text.split(EMAIL).map((part, i) =>
      i % 2 === 1
        ? <a key={i} href={`mailto:${part}`} className="font-medium text-primary hover:underline">{part}</a>
        : part,
    )}
  </p>
);

export default LegalContact;
