"""Compatibility entry point for the prospective injury research benchmark.

The implementation lives in prospective_injury_benchmark.py so validation
logic can be tested and audited without mixing it with CLI wiring.
"""

from prospective_injury_benchmark import main


if __name__ == "__main__":
    main()
