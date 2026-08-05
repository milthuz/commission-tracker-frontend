import React, { useState } from 'react';

/**
 * Champ de mot de passe avec œil de révélation.
 *
 * POURQUOI : quelqu'un qui CHOISIT un mot de passe le tape à l'aveugle, deux fois, sans
 * pouvoir vérifier. C'est la première cause d'un « mot de passe invalide » à la première
 * connexion — la personne a fait une faute de frappe qu'aucun des deux champs ne lui a
 * montrée. L'œil ne réduit pas la sécurité : il la déplace vers ce que la personne
 * contrôle, à savoir regarder autour d'elle avant de cliquer.
 *
 * Reprend l'API d'un `<input>` : toutes les propriétés non listées sont transmises telles
 * quelles, pour que la bascule des champs existants reste mécanique.
 */
const PasswordInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { className?: string }
> = ({ className = '', ...rest }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        type={shown ? 'text' : 'password'}
        // De la place pour le bouton, sinon le texte passe dessous quand il est long.
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        // `tabIndex={-1}` : la tabulation doit aller du mot de passe au bouton d'envoi,
        // pas s'arrêter sur une commande d'affichage.
        tabIndex={-1}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-body hover:text-primary"
      >
        {shown ? (
          // Œil barré : le mot de passe est visible, cliquer le cache.
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.6C4.6 7.9 3.1 9.8 2.3 11.7a.9.9 0 000 .6C3.9 16.5 7.6 19.5 12 19.5c1.6 0 3.1-.4 4.4-1.1M17.9 16A13 13 0 0021.7 12.3a.9.9 0 000-.6C20.1 7.5 16.4 4.5 12 4.5c-.8 0-1.6.1-2.3.3" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.3 11.7a.9.9 0 010-.6C3.9 7.5 7.6 4.5 12 4.5s8.1 3 9.7 6.6a.9.9 0 010 .6C20.1 16.5 16.4 19.5 12 19.5s-8.1-3-9.7-7.8z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default PasswordInput;
