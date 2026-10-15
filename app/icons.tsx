// MingCute Core Regular, Apache-2.0. See THIRD_PARTY_NOTICES.md.
// Adapted from commit ca98bb55513a22ff0dab713aaf7870b512944653:
// JSX attributes, currentColor, inherited display size and decorative accessibility attributes.

type IconProps = { className?: string; width?: number | string; height?: number | string };

// files/external_link.svg
export function ExternalLinkIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M17 13V19C17 19.5523 16.5523 20 16 20H5C4.44772 20 4 19.5523 4 19V8C4 7.44772 4.44772 7 5 7H11M20 9V4L15 4M10 14L19.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// system/close.svg
export function CloseIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M5.63599 5.63672L18.3639 18.3646M5.63599 18.3647L18.3639 5.63682" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// business/tag.svg
export function TagIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M3.73794 12.2229C3.31823 11.8031 3.10663 11.2187 3.16037 10.6276L3.63178 5.44213C3.71918 4.48062 4.48099 3.71882 5.44249 3.63141L10.6279 3.16C11.2191 3.10627 11.8035 3.31787 12.2232 3.73758L20.0461 11.5605C20.8272 12.3415 20.8272 13.6079 20.0461 14.3889L14.3893 20.0458C13.6082 20.8268 12.3419 20.8268 11.5608 20.0458L3.73794 12.2229Z" stroke="currentColor" strokeWidth="2" />
      <path d="M10.8527 8.02504C11.6338 8.80608 11.6338 10.0724 10.8527 10.8535C10.0717 11.6345 8.80536 11.6345 8.02431 10.8535C7.24326 10.0724 7.24326 8.80608 8.02431 8.02504C8.80536 7.24399 10.0717 7.24399 10.8527 8.02504Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// locations/aiming.svg
export function WeaponFilterIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M12.5 12C12.5 12.2761 12.2761 12.5 12 12.5C11.7239 12.5 11.5 12.2761 11.5 12C11.5 11.7239 11.7239 11.5 12 11.5C12.2761 11.5 12.5 11.7239 12.5 12Z" fill="currentColor" />
      <path d="M12 3V6M12 18V21M3 12H6M18 12H21M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12ZM12.5 12C12.5 12.2761 12.2761 12.5 12 12.5C11.7239 12.5 11.5 12.2761 11.5 12C11.5 11.7239 11.7239 11.5 12 11.5C12.2761 11.5 12.5 11.7239 12.5 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// editing/edit.svg
export function EditIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M20 11V19C20 19.5523 19.5523 20 19 20H5C4.44772 20 4 19.5523 4 19V5C4 4.44772 4.44772 4 5 4H13M20 4L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// system/eye.svg
export function ViewIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M21 12C21 14.5 16.9706 19 12 19C7.02944 19 3 14.5 3 12C3 9.5 7.02944 5 12 5C16.9706 5 21 9.5 21 12Z" stroke="currentColor" strokeWidth="2" />
      <path d="M11.0117 10.2617C11.1368 11.7094 12.2898 12.8617 13.7373 12.9873C13.3932 13.5915 12.7451 14 12 14C10.8954 14 10 13.1046 10 12C10 11.255 10.4077 10.6059 11.0117 10.2617Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// system/delete_2.svg
export function RemoveIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M5 6L5.87554 19.133C5.94558 20.1836 6.81818 21 7.87111 21H16.1289C17.1818 21 18.0544 20.1836 18.1245 19.133L19 6M8 6L8.77208 3.68377C8.90819 3.27543 9.29033 3 9.72076 3H14.2792C14.7097 3 15.0918 3.27543 15.2279 3.68377L16 6M10 11V16M14 11V16M4 6H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// files/link.svg
export function LinkIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M11.6464 5.98873L10.2322 4.57452C8.67013 3.01242 6.13747 3.01242 4.57538 4.57452C3.01328 6.13662 3.01328 8.66928 4.57538 10.2314L7.4038 13.0598C8.9659 14.6219 11.4986 14.6219 13.0607 13.0598M12.3535 18.0095L13.7678 19.4238C15.3299 20.9859 17.8625 20.9859 19.4246 19.4238C20.9867 17.8617 20.9867 15.329 19.4246 13.7669L16.5962 10.9385C15.0341 9.37638 12.5014 9.37638 10.9393 10.9385" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// files/copy_2.svg
export function CopyCountIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M8 6V4C8 3.44772 8.44772 3 9 3H20C20.5523 3 21 3.44772 21 4V15C21 15.5523 20.5523 16 20 16H18M4 21H15C15.5523 21 16 20.5523 16 20V9C16 8.44772 15.5523 8 15 8H4C3.44772 8 3 8.44772 3 9V20C3 20.5523 3.44772 21 4 21Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// system/add.svg
export function PlusIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M5 12H19M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// system/check.svg
export function CheckIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M3.51442 11.8293L9.17127 17.4862L20.485 6.17248" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// files/pic.svg
export function PictureIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M16 8.5C16 8.77614 15.7761 9 15.5 9C15.2239 9 15 8.77614 15 8.5C15 8.22386 15.2239 8 15.5 8C15.7761 8 16 8.22386 16 8.5Z" fill="currentColor" />
      <path d="M14.1213 14.8786C13.7307 15.2691 13.7307 15.9023 14.1213 16.2928C14.5118 16.6833 15.145 16.6833 15.5355 16.2928L14.8284 15.5857L14.1213 14.8786ZM16.9497 13.4644L17.6568 12.7573C17.2663 12.3667 16.6331 12.3667 16.2426 12.7573L16.9497 13.4644ZM20.2781 18.207C20.6686 18.5975 21.3018 18.5975 21.6923 18.207C22.0829 17.8165 22.0829 17.1833 21.6923 16.7928L20.9852 17.4999L20.2781 18.207ZM9.87861 10.636L10.5857 9.92893C10.1952 9.53841 9.56203 9.53841 9.1715 9.92893L9.87861 10.636ZM15.0355 17.2071C15.426 17.5976 16.0592 17.5976 16.4497 17.2071C16.8402 16.8166 16.8402 16.1834 16.4497 15.7929L15.7426 16.5L15.0355 17.2071ZM4 4V5H20V4V3H4V4ZM21 5H20V19H21H22V5H21ZM20 20V19H4V20V21H20V20ZM3 19H4V5H3H2V19H3ZM14.8284 15.5857L15.5355 16.2928L17.6568 14.1715L16.9497 13.4644L16.2426 12.7573L14.1213 14.8786L14.8284 15.5857ZM16.9497 13.4644L16.2426 14.1715L20.2781 18.207L20.9852 17.4999L21.6923 16.7928L17.6568 12.7573L16.9497 13.4644ZM9.87861 10.636L9.1715 11.3431L15.0355 17.2071L15.7426 16.5L16.4497 15.7929L10.5857 9.92893L9.87861 10.636ZM3 17.5146L3.70711 18.2218L10.5857 11.3431L9.87861 10.636L9.1715 9.92893L2.29289 16.8075L3 17.5146ZM16 8.5H15C15 8.22386 15.2239 8 15.5 8V9V10C16.3284 10 17 9.32843 17 8.5H16ZM15.5 9V8C15.7761 8 16 8.22386 16 8.5H15H14C14 9.32843 14.6716 10 15.5 10V9ZM15 8.5H16C16 8.77614 15.7761 9 15.5 9V8V7C14.6716 7 14 7.67157 14 8.5H15ZM15.5 8V9C15.2239 9 15 8.77614 15 8.5H16H17C17 7.67157 16.3284 7 15.5 7V8ZM4 20V19H4H3H2C2 20.1046 2.89543 21 4 21V20ZM21 19H20V19V20V21C21.1046 21 22 20.1046 22 19H21ZM20 4V5V5H21H22C22 3.89543 21.1046 3 20 3V4ZM4 4V3C2.89543 3 2 3.89543 2 5H3H4V5V4Z" fill="currentColor" />
    </svg>
  );
}

// system/question_2.svg
export function HelpQuestionIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M7 9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9C17 10.2574 16.2095 11.5148 14.877 12.2752C13.4379 13.0963 12 14.3431 12 16V16.5M12 20H12.0035" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// system/question.svg
export function HelpCircleIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M12 17H12.002M9.375 10.125C9.375 8.67525 10.5503 7.5 12 7.5C13.4497 7.5 14.625 8.67525 14.625 10.125C14.625 11.2297 13.9426 12.1751 12.9763 12.5625C12.4636 12.768 12 13.1977 12 13.75V14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// miscellaneous/random.svg
export function DiceIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M12.5 12C12.5 12.2761 12.2761 12.5 12 12.5C11.7239 12.5 11.5 12.2761 11.5 12C11.5 11.7239 11.7239 11.5 12 11.5C12.2761 11.5 12.5 11.7239 12.5 12Z" fill="currentColor" />
      <path d="M9 8.5C9 8.77614 8.77614 9 8.5 9C8.22386 9 8 8.77614 8 8.5C8 8.22386 8.22386 8 8.5 8C8.77614 8 9 8.22386 9 8.5Z" fill="currentColor" />
      <path d="M9 15.5C9 15.7761 8.77614 16 8.5 16C8.22386 16 8 15.7761 8 15.5C8 15.2239 8.22386 15 8.5 15C8.77614 15 9 15.2239 9 15.5Z" fill="currentColor" />
      <path d="M16 8.5C16 8.77614 15.7761 9 15.5 9C15.2239 9 15 8.77614 15 8.5C15 8.22386 15.2239 8 15.5 8C15.7761 8 16 8.22386 16 8.5Z" fill="currentColor" />
      <path d="M16 15.5C16 15.7761 15.7761 16 15.5 16C15.2239 16 15 15.7761 15 15.5C15 15.2239 15.2239 15 15.5 15C15.7761 15 16 15.2239 16 15.5Z" fill="currentColor" />
      <path d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12.5 12C12.5 12.2761 12.2761 12.5 12 12.5C11.7239 12.5 11.5 12.2761 11.5 12C11.5 11.7239 11.7239 11.5 12 11.5C12.2761 11.5 12.5 11.7239 12.5 12Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8.5C9 8.77614 8.77614 9 8.5 9C8.22386 9 8 8.77614 8 8.5C8 8.22386 8.22386 8 8.5 8C8.77614 8 9 8.22386 9 8.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 15.5C9 15.7761 8.77614 16 8.5 16C8.22386 16 8 15.7761 8 15.5C8 15.2239 8.22386 15 8.5 15C8.77614 15 9 15.2239 9 15.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16 8.5C16 8.77614 15.7761 9 15.5 9C15.2239 9 15 8.77614 15 8.5C15 8.22386 15.2239 8 15.5 8C15.7761 8 16 8.22386 16 8.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16 15.5C16 15.7761 15.7761 16 15.5 16C15.2239 16 15 15.7761 15 15.5C15 15.2239 15.2239 15 15.5 15C15.7761 15 16 15.2239 16 15.5Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// arrow/transfer_horizontal.svg
export function SwapIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M11.4999 7.99995H7.99984L7.99984 5.20687C7.99984 4.76143 7.4613 4.53834 7.14631 4.85329L2.35242 9.64652C2.15712 9.84179 2.15713 10.1584 2.35243 10.3537L7.14632 15.1465C7.46132 15.4615 7.99984 15.2384 7.99984 14.793L7.99984 11.9999L15.9995 11.9995L15.9995 9.20647C15.9995 8.76104 16.538 8.53794 16.853 8.85287L21.6469 13.6457C21.8422 13.841 21.8422 14.1576 21.6469 14.3529L16.853 19.1461C16.538 19.4611 15.9995 19.238 15.9995 18.7926V15.9995H12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// media/camera.svg
export function CameraIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M17 7H18M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12ZM5 20H19C20.1046 20 21 19.1046 21 18V6C21 4.89543 20.1046 4 19 4H5C3.89543 4 3 4.89543 3 6V18C3 19.1046 3.89543 20 5 20Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// media/pause.svg
export function PauseIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M8 5V19M16 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// media/play.svg
export function PlayIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M6.66145 4.87926C6.69988 4.56188 7.02278 4.37581 7.31671 4.50153C8.34895 4.94302 10.6924 6.00435 13.6713 7.72422C16.6508 9.44448 18.742 10.9436 19.6401 11.6165C19.8957 11.8081 19.8962 12.1803 19.6407 12.3721C18.7524 13.0391 16.6871 14.52 13.6702 16.2618C10.6523 18.0043 8.33655 19.0525 7.31532 19.488C7.02183 19.6132 6.70006 19.4273 6.66168 19.1105C6.52716 18.0003 6.27344 15.4483 6.27344 11.9939C6.27344 8.54158 6.52687 5.99057 6.66145 4.87926Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// arrow/arrow_up.svg
export function ArrowUpIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M12.0001 20V5M6.34326 10.0001L12.0001 4.34326L17.657 10.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// arrow/arrow_down.svg
export function ArrowDownIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M12.0001 19V4M6.34326 13.9999L12.0001 19.6567L17.657 13.9999" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// arrow/transfer_vertical.svg
export function SortIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M15.9996 11.5L15.9996 7.99996L18.7927 7.99996C19.2381 7.99996 19.4612 7.46142 19.1463 7.14643L14.353 2.35254C14.1577 2.15724 13.8411 2.15725 13.6459 2.35256L8.85299 7.14644C8.53806 7.46144 8.76116 7.99996 9.20659 7.99996L11.9997 7.99996L12 15.9996L14.7931 15.9996C15.2385 15.9996 15.4616 16.5381 15.1467 16.8531L10.3538 21.647C10.1585 21.8423 9.84192 21.8423 9.64664 21.647L4.85341 16.8532C4.53846 16.5382 4.76155 15.9996 5.20699 15.9996H8.00008V12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// brands/github.svg
export function GitHubIcon({ className = "", width = "1em", height = "1em" }: IconProps = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={width} height={height} className={`ui-icon ${className}`} aria-hidden="true" focusable="false">
      <path d="M3 16.0005C4.5 16.5005 4.5 19.5005 8 19.0005L9 18.8005M15 21.0005V18.0005C15 17.1397 14.6375 16.3636 14.0568 15.8166C14.0509 15.811 14.0538 15.8009 14.0618 15.7993C17.4809 15.1173 20 12.7795 20 10.0005C20 8.73889 19.4808 7.56822 18.594 6.60212C18.5913 6.59926 18.5906 6.59511 18.5921 6.59151C19.2238 5.0552 18.6402 3.07247 18.4963 3.0005C18.357 2.93086 16.5389 3.28886 15.0463 4.44634C15.0437 4.44834 15.0403 4.44898 15.0372 4.44802C14.1007 4.15956 13.0751 4.0005 12 4.0005C10.9239 4.0005 9.89737 4.15986 8.96015 4.44883C8.95703 4.4498 8.95363 4.44916 8.95105 4.44716C7.45827 3.28903 5.6393 2.93084 5.5 3.0005C5.35601 3.07251 4.77182 5.0576 5.40536 6.5943C5.40684 6.59789 5.40611 6.60204 5.40348 6.60491C4.51818 7.57048 4 8.74011 4 10.0005C4 12.7795 6.51913 15.1173 9.93818 15.7993C9.94618 15.8009 9.94912 15.811 9.94318 15.8166C9.36251 16.3636 9 17.1397 9 18.0005V21.0005" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 16.0005C4.5 16.5005 4.5 19.5005 8 19.0005L9 18.8005M15 21.0005V18.0005C15 17.1397 14.6375 16.3636 14.0568 15.8166C14.0509 15.811 14.0538 15.8009 14.0618 15.7993C17.4809 15.1173 20 12.7795 20 10.0005C20 8.73889 19.4808 7.56822 18.594 6.60212C18.5913 6.59926 18.5906 6.59511 18.5921 6.59151C19.2238 5.0552 18.6402 3.07247 18.4963 3.0005C18.357 2.93086 16.5389 3.28886 15.0463 4.44634C15.0437 4.44834 15.0403 4.44898 15.0372 4.44802C14.1007 4.15956 13.0751 4.0005 12 4.0005C10.9239 4.0005 9.89737 4.15986 8.96015 4.44883C8.95703 4.4498 8.95363 4.44916 8.95105 4.44716C7.45827 3.28903 5.6393 2.93084 5.5 3.0005C5.35601 3.07251 4.77182 5.0576 5.40536 6.5943C5.40684 6.59789 5.40611 6.60204 5.40348 6.60491C4.51818 7.57048 4 8.74011 4 10.0005C4 12.7795 6.51913 15.1173 9.93818 15.7993C9.94618 15.8009 9.94912 15.811 9.94318 15.8166C9.36251 16.3636 9 17.1397 9 18.0005V21.0005" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
