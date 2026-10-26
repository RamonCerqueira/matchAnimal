type PetFriendsProps = { mood?: "welcome" | "friends" | "love"; label?: string };

/** Pequenos personagens vetoriais para dar contexto às telas sem conteúdo do app. */
export function PetFriends({ mood = "welcome", label = "Cão, gato e coelho" }: PetFriendsProps) {
  return (
    <div className={`pet-friends pet-friends-${mood}`} role="img" aria-label={label}>
      <svg className="pet-friend pet-friend-dog" viewBox="0 0 100 100" aria-hidden="true">
        <path className="pet-dog-ear" d="M24 24C8 13 8 49 25 53M76 24c16-11 16 25-1 29" />
        <ellipse className="pet-dog-head" cx="50" cy="51" rx="34" ry="36" />
        <ellipse className="pet-dog-muzzle" cx="50" cy="64" rx="19" ry="14" />
        <circle className="pet-eye" cx="38" cy="48" r="3"/><circle className="pet-eye" cx="62" cy="48" r="3"/>
        <ellipse className="pet-nose" cx="50" cy="60" rx="5" ry="3.5"/><path className="pet-smile" d="M50 63v5m0 0c-4 5-8 1-9-1m9 1c4 5 8 1 9-1"/>
        <path className="pet-blush" d="M28 60h5m34 0h5"/>
      </svg>
      <svg className="pet-friend pet-friend-cat" viewBox="0 0 100 100" aria-hidden="true">
        <path className="pet-cat-head" d="M17 42 20 15l23 16q7-2 14 0l23-16 3 27c8 28-8 45-33 45S9 70 17 42Z"/>
        <path className="pet-cat-ear-inner" d="m25 24 13 10-14 1m51-11L62 34l14 1"/>
        <path className="pet-eye" d="M34 49q5-6 10 0m13 0q5-6 10 0"/><path className="pet-nose" d="m47 58 3 3 3-3Z"/><path className="pet-smile" d="M50 61v5m0 0q-6 5-10 0m10 0q6 5 10 0"/>
        <path className="pet-whiskers" d="m30 59-15-3m15 8-15 2m55-7 15-3m-15 8 15 2"/>
      </svg>
      <svg className="pet-friend pet-friend-bunny" viewBox="0 0 100 100" aria-hidden="true">
        <ellipse className="pet-bunny-ear" cx="38" cy="24" rx="9" ry="24" transform="rotate(-12 38 24)"/><ellipse className="pet-bunny-ear" cx="64" cy="23" rx="9" ry="24" transform="rotate(10 64 23)"/>
        <ellipse className="pet-bunny-head" cx="51" cy="57" rx="32" ry="30"/><ellipse className="pet-bunny-muzzle" cx="51" cy="68" rx="16" ry="11"/>
        <circle className="pet-eye" cx="40" cy="53" r="3"/><circle className="pet-eye" cx="62" cy="53" r="3"/><path className="pet-nose" d="m48 64 3 3 3-3Z"/><path className="pet-smile" d="M51 67v5m0 0q-5 4-8 0m8 0q5 4 8 0"/>
      </svg>
      <span className="pet-friends-sparkle pet-friends-sparkle-one">✦</span><span className="pet-friends-sparkle pet-friends-sparkle-two">✧</span>
    </div>
  );
}
