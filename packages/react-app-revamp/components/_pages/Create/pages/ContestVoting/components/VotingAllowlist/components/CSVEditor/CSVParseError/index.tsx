import { FC, ReactNode, useMemo } from "react";

export type ParseError = "missingColumns" | "limitExceeded" | "duplicates" | "over18Decimal" | "";

interface CSVParseErrorProps {
  step: "voting" | "submission";
  type: ParseError;
}

const CSVParseError: FC<CSVParseErrorProps> = ({ type, step }) => {
  const errorContent = useMemo<ReactNode>(() => {
    if (!type) return null;

    switch (type) {
      case "missingColumns":
        return (
          <div className="flex flex-col text-[16px] animate-fadeIn">
            {step === "voting" ? (
              <p className=" text-negative-11">
                Ruh-roh! CSV couldn’t be imported.{" "}
                <span className="font-bold">
                  Make sure there are no headers or additional <br />
                  columns.
                </span>{" "}
                CSV should have 1) only two columns, 2) a first column containing <span className="italic">
                  only
                </span>{" "}
                valid <br />
                EVM addresses, and 3) a second column containing number of votes.
              </p>
            ) : (
              <p className=" text-negative-11">
                ruh-roh! csv couldn’t be imported.{" "}
                <span className="font-bold">
                  make sure there are no headers or additional <br />
                  columns.
                </span>{" "}
                csv should have 1) only one column, 2) a column containing <span className="italic">only</span> valid
                <br /> EVM addresses
              </p>
            )}
          </div>
        );
      case "limitExceeded":
        return (
          <div className="flex flex-col text-[16px] animate-fadeIn">
            <p className=" text-negative-11">
              Ruh-roh! CSV file has too many rows.{" "}
              <span className="font-bold">The maximum number of rows allowed is 10,000</span>
            </p>
          </div>
        );
      case "duplicates":
        return (
          <div className="flex flex-col text-[16px] animate-fadeIn">
            <p className=" text-negative-11">
              Ruh-roh! CSV file has duplicated addresses.{" "}
              <span className="font-bold">CSV should have distinct addresses</span>
            </p>
          </div>
        );
      case "over18Decimal":
        return (
          <div className="flex flex-col text-[16px] animate-fadeIn">
            <p className=" text-negative-11">
              Ruh-roh! CSV file has some votes with over 18 decimals{" "}
              <span className="font-bold">CSV should have vote values with less decimals</span>
            </p>
          </div>
        );
      default:
        return null;
    }
  }, [type]);

  return <>{errorContent}</>;
};

export default CSVParseError;