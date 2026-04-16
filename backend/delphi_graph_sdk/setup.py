"""
Setup configuration for DelphiGraph Python SDK
"""

from setuptools import setup, find_packages
import os

# Read README from parent directory
readme_path = os.path.join(os.path.dirname(__file__), "README.md")
with open(readme_path, "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="delphi-graph-sdk",
    version="0.1.0",
    author="DelphiGraph Team",
    author_email="support@delphigraph.com",
    description="Python SDK for connecting local AI agents to DelphiGraph signal analysis platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/delphigraph/python-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "httpx>=0.24.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "hypothesis>=6.0.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
        ],
    },
)
